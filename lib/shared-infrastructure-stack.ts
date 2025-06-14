import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as events from 'aws-cdk-lib/aws-events'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface SharedInfrastructureStackProps extends cdk.StackProps {
  appName: string
  environment: string
}

export class SharedInfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly eventBus: events.EventBus
  public readonly sharedLogGroup: logs.LogGroup

  constructor(
    scope: Construct,
    id: string,
    props: SharedInfrastructureStackProps
  ) {
    super(scope, id, props)

    const { appName, environment } = props

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

    // Create shared IAM role for services
    const sharedServiceRole = new iam.Role(this, 'SharedServiceRole', {
      roleName: `${appName}-${environment}-shared-service-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        )
      ]
    })

    // Add permissions for EventBridge
    this.eventBus.grantPutEventsTo(sharedServiceRole)

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
  }
}
