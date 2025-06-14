# Word Collect Shared Infrastructure

This repository contains the shared infrastructure for the Word Collect microservices application. It manages common resources used across all services.

## Resources

- VPC with public and private subnets
- EventBridge bus for service-to-service communication
- Shared CloudWatch Log Group
- Shared IAM roles and policies
- Shared S3 bucket for data storage

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
- S3 Bucket: `word-collect-dev-shared-data`

## Available Environments

- dev
- staging
- prod

## Shared Resources

### S3 Bucket

The shared S3 bucket (`word-collect-{environment}-shared-data`) is available for storing data that needs to be accessed by multiple services.

#### Features

- Private bucket (no public access)
- S3-managed encryption
- Versioning enabled
- 30-day lifecycle rule for old versions
- RETAIN removal policy

#### Usage

1. **Uploading Data**

   ```bash
   # Example: Upload a file to the dictionary service's data directory
   aws s3 cp ./seed-data.jsonl s3://word-collect-dev-shared-data/dictionary-service/seed-data.jsonl
   ```

2. **Accessing from Services**
   - Services can access the bucket using the shared IAM role
   - Role ARN is exported as: `word-collect-{environment}-shared-data-role-arn`
   - Role provides read-only access (`s3:GetObject`, `s3:ListBucket`)

#### Directory Structure

```
s3://word-collect-{environment}-shared-data/
├── dictionary-service/
│   └── seed-data.jsonl
└── other-service/
    └── ...
```

## Outputs

The stack outputs the following values that can be referenced by other stacks:

- VPC ID
- EventBus Name
- Shared Log Group Name
- Shared Data Bucket Name
- Shared Data Bucket Role ARN

## Development

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch for changes and compile
- `npm run test` - Run tests
- `npm run cdk` - Run CDK CLI commands
- `npm run synth` - Synthesize CloudFormation template
