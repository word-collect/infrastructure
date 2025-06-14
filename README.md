# Word Collect Shared Infrastructure

This repository contains the shared infrastructure for the Word Collect microservices application. It manages common resources used across all services.

## Resources

- VPC with public and private subnets
- EventBridge bus for service-to-service communication
- Shared CloudWatch Log Group
- Shared IAM roles and policies

## Prerequisites

- Node.js 16.x or later
- AWS CLI configured with appropriate credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

## Deployment

To deploy the infrastructure:

```bash
# Deploy to dev environment
npm run deploy

# Deploy to specific environment
npm run deploy -- -c environment=prod
```

## Resource Naming Convention

All resources follow the naming pattern:

```
word-collect-{environment}-{resource-type}-{resource-name}
```

For example:

- VPC: `word-collect-dev-vpc`
- EventBus: `word-collect-dev-event-bus`
- Log Group: `/word-collect/dev/shared-logs`

## Available Environments

- dev
- staging
- prod

## Outputs

The stack outputs the following values that can be referenced by other stacks:

- VPC ID
- EventBus Name
- Shared Log Group Name

## Development

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and compile
- `npm run test` - Run tests
- `npm run cdk` - Run CDK CLI commands
- `npm run synth` - Synthesize CloudFormation template
