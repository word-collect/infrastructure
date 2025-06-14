import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as events from 'aws-cdk-lib/aws-events'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'

export interface SharedInfrastructureStackProps extends cdk.StackProps {
  appName: string
  environment: string
}

export class SharedInfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly eventBus: events.EventBus
  public readonly sharedLogGroup: logs.LogGroup
  public readonly ecsCluster: ecs.Cluster
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer
  public readonly taskExecutionRole: iam.Role
  public readonly serviceRole: iam.Role
  public readonly hostedZone: route53.HostedZone
  public readonly certificate: acm.Certificate

  constructor(
    scope: Construct,
    id: string,
    props: SharedInfrastructureStackProps
  ) {
    super(scope, id, props)

    const { appName, environment } = props
    const domainName = 'wordcollect.haydenturek.com'

    // Create VPC with public and private subnets
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${appName}-${environment}-vpc`,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24
        }
      ]
    })

    // Create EventBridge bus for service-to-service communication
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `${appName}-${environment}-event-bus`
    })

    // Create shared CloudWatch Log Group
    this.sharedLogGroup = new logs.LogGroup(this, 'SharedLogGroup', {
      logGroupName: `/${appName}/${environment}/shared-logs`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    })

    // Create ECS Cluster
    this.ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: `${appName}-${environment}-cluster`,
      vpc: this.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true
    })

    // Create shared IAM roles for ECS
    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${appName}-${environment}-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        )
      ]
    })

    this.serviceRole = new iam.Role(this, 'ServiceRole', {
      roleName: `${appName}-${environment}-service-role`,
      assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonEC2ContainerServiceRole'
        )
      ]
    })

    // Create security groups
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `${appName}-${environment}-alb-sg`,
      description: 'Security group for ALB',
      allowAllOutbound: true
    })

    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `${appName}-${environment}-ecs-sg`,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true
    })

    // Allow inbound traffic from ALB to ECS tasks
    ecsSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(80),
      'Allow inbound traffic from ALB'
    )

    // Create hosted zone for the subdomain
    this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: domainName,
      comment: `Hosted zone for ${domainName}`
    })

    // Create ACM certificate
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone)
    })

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      'LoadBalancer',
      {
        vpc: this.vpc,
        internetFacing: true,
        securityGroup: albSecurityGroup,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC
        },
        loadBalancerName: `${appName}-${environment}-alb`
      }
    )

    // Create HTTPS listener with the certificate
    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [this.certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found'
      })
    })

    // Create HTTP listener that redirects to HTTPS
    this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true
      })
    })

    // Create DNS record for the load balancer
    new route53.ARecord(this, 'LoadBalancerDnsRecord', {
      zone: this.hostedZone,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(this.loadBalancer)
      ),
      recordName: domainName
    })

    // Create CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'EcsDashboard', {
      dashboardName: `${appName}-${environment}-ecs-dashboard`
    })

    // Add cluster metrics to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cluster CPU Utilization',
        left: [this.ecsCluster.metricCpuUtilization()]
      }),
      new cloudwatch.GraphWidget({
        title: 'Cluster Memory Utilization',
        left: [this.ecsCluster.metricMemoryUtilization()]
      })
    )

    // Output important values
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${appName}-${environment}-vpc-id`
    })

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'EventBridge Bus Name',
      exportName: `${appName}-${environment}-event-bus-name`
    })

    new cdk.CfnOutput(this, 'SharedLogGroupName', {
      value: this.sharedLogGroup.logGroupName,
      description: 'Shared Log Group Name',
      exportName: `${appName}-${environment}-shared-log-group-name`
    })

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${appName}-${environment}-ecs-cluster-name`
    })

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Load Balancer DNS Name',
      exportName: `${appName}-${environment}-alb-dns`
    })

    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: this.taskExecutionRole.roleArn,
      description: 'ECS Task Execution Role ARN',
      exportName: `${appName}-${environment}-task-execution-role-arn`
    })

    new cdk.CfnOutput(this, 'ServiceRoleArn', {
      value: this.serviceRole.roleArn,
      description: 'ECS Service Role ARN',
      exportName: `${appName}-${environment}-service-role-arn`
    })

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Hosted Zone ID',
      exportName: `${appName}-${environment}-hosted-zone-id`
    })

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN',
      exportName: `${appName}-${environment}-certificate-arn`
    })
  }
}
