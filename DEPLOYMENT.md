# Deployment Guide

## 🚀 Quick Start

### Using Docker Hub Image

```bash
# Pull from Docker Hub
docker pull your-dockerhub-username/dynamodb-mcp-server:latest

# Run with environment variables
docker run -it \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_REGION=us-east-1 \
  your-dockerhub-username/dynamodb-mcp-server:latest
```

## 🏗️ Hosting Options

### 1. **Docker Hub (Container Registry)**

**Pros:**

- Free for public repositories
- Easy to use and widely adopted
- Good for distribution

**Setup:**

```bash
# Login to Docker Hub
docker login

# Tag your image
docker tag dynamodb-mcp-server:latest your-dockerhub-username/dynamodb-mcp-server:latest

# Push to Docker Hub
docker push yusuf2403/dynamodb-mcp-server:latest
```

### 2. **AWS ECR (Elastic Container Registry)**

**Pros:**

- Integrated with AWS services
- High performance within AWS
- Good for production workloads

**Setup:**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Create repository
aws ecr create-repository --repository-name dynamodb-mcp-server --region us-east-1

# Tag and push
docker tag dynamodb-mcp-server:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/dynamodb-mcp-server:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/dynamodb-mcp-server:latest
```

### 3. **Google Container Registry (GCR)**

**Pros:**

- Integrated with Google Cloud
- Good performance on GCP
- Automatic vulnerability scanning

**Setup:**

```bash
# Configure Docker to use gcloud
gcloud auth configure-docker

# Tag and push
docker tag dynamodb-mcp-server:latest gcr.io/your-project-id/dynamodb-mcp-server:latest
docker push gcr.io/your-project-id/dynamodb-mcp-server:latest
```

### 4. **GitHub Container Registry (GHCR)**

**Pros:**

- Free for public repositories
- Integrated with GitHub
- Good for open source projects

**Setup:**

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin

# Tag and push
docker tag dynamodb-mcp-server:latest ghcr.io/your-username/dynamodb-mcp-server:latest
docker push ghcr.io/your-username/dynamodb-mcp-server:latest
```

## 🌐 Cloud Hosting Options

### 1. **AWS ECS (Elastic Container Service)**

**Best for:** Production workloads, AWS ecosystem

```yaml
# ecs-task-definition.json
{
  "family": "dynamodb-mcp-server",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions":
    [
      {
        "name": "dynamodb-mcp-server",
        "image": "your-dockerhub-username/dynamodb-mcp-server:latest",
        "essential": true,
        "environment": [{ "name": "AWS_REGION", "value": "us-east-1" }],
        "secrets":
          [
            {
              "name": "AWS_ACCESS_KEY_ID",
              "valueFrom": "arn:aws:secretsmanager:region:account:secret:aws-credentials-abc123:AWS_ACCESS_KEY_ID::",
            },
            {
              "name": "AWS_SECRET_ACCESS_KEY",
              "valueFrom": "arn:aws:secretsmanager:region:account:secret:aws-credentials-abc123:AWS_SECRET_ACCESS_KEY::",
            },
          ],
        "logConfiguration":
          {
            "logDriver": "awslogs",
            "options":
              {
                "awslogs-group": "/ecs/dynamodb-mcp-server",
                "awslogs-region": "us-east-1",
                "awslogs-stream-prefix": "ecs",
              },
          },
      },
    ],
}
```

### 2. **Google Cloud Run**

**Best for:** Serverless, pay-per-use

```bash
# Deploy to Cloud Run
gcloud run deploy dynamodb-mcp-server \
  --image gcr.io/your-project-id/dynamodb-mcp-server:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars AWS_REGION=us-east-1 \
  --set-secrets AWS_ACCESS_KEY_ID=aws-credentials:AWS_ACCESS_KEY_ID \
  --set-secrets AWS_SECRET_ACCESS_KEY=aws-credentials:AWS_SECRET_ACCESS_KEY
```

### 3. **Azure Container Instances**

**Best for:** Simple container deployment

```bash
# Deploy to Azure Container Instances
az container create \
  --resource-group myResourceGroup \
  --name dynamodb-mcp-server \
  --image your-dockerhub-username/dynamodb-mcp-server:latest \
  --environment-variables AWS_REGION=us-east-1 \
  --secure-environment-variables AWS_ACCESS_KEY_ID=your_key AWS_SECRET_ACCESS_KEY=your_secret \
  --restart-policy Always
```

### 4. **Kubernetes**

**Best for:** Large-scale deployments

```yaml
# kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dynamodb-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dynamodb-mcp-server
  template:
    metadata:
      labels:
        app: dynamodb-mcp-server
    spec:
      containers:
        - name: dynamodb-mcp-server
          image: your-dockerhub-username/dynamodb-mcp-server:latest
          env:
            - name: AWS_REGION
              value: "us-east-1"
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: access-key-id
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: secret-access-key
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

## 🔧 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/docker-publish.yml
name: Docker Build and Push

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: your-dockerhub-username/dynamodb-mcp-server

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## 🔐 Security Best Practices

1. **Use secrets management** (AWS Secrets Manager, Kubernetes Secrets)
2. **Enable vulnerability scanning** in your container registry
3. **Use non-root user** (already implemented in Dockerfile)
4. **Regularly update base images**
5. **Use specific image tags** instead of `latest` in production

## 📊 Monitoring and Logging

### CloudWatch (AWS)

```bash
# Create log group
aws logs create-log-group --log-group-name /ecs/dynamodb-mcp-server
```

### Google Cloud Logging

```bash
# View logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dynamodb-mcp-server"
```

## 🧪 Testing Deployment

```bash
# Test the deployed container
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | docker run -i \
  -e AWS_ACCESS_KEY_ID=your_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret \
  -e AWS_REGION=us-east-1 \
  your-dockerhub-username/dynamodb-mcp-server:latest
```

## 💡 Recommendations

**For Development:**

- Use Docker Hub for easy sharing
- Use docker-compose for local testing

**For Production:**

- Use AWS ECR if running on AWS
- Use Google GCR if running on GCP
- Enable monitoring and logging
- Use secrets management
- Set up health checks
- Configure auto-scaling

Choose the hosting option that best fits your infrastructure and requirements!
