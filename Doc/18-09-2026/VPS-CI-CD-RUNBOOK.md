# VPS CI/CD Runbook

## 1. What this does
GitHub Actions deploys Clara to the VPS after CI/build succeeds.

Flow:
Push -> Lint/Test -> Build -> VPS Deploy -> Health Check

Deployment uses SSH. VPS .env and persistent Docker data stay on the server.

## 2. GitHub screen setup
Open:
Repository -> Settings -> Environments -> New environment

Create:
production

Optional protection:
- Required reviewers: enable if manual approval is wanted.
- Deployment branches: select branches/tags allowed to deploy.
- Keep Vite-Converted while testing.
- Later use main for production.

GitHub environments can restrict branches, protect deployments, and scope secrets.

## 3. Add VPS secrets
Open:
Settings -> Environments -> production -> Environment secrets -> Add secret

Create exactly:
VPS_HOST
VPS_USER
VPS_PORT
VPS_SSH_KEY
VPS_KNOWN_HOSTS
VPS_APP_DIR

Example values:
VPS_HOST = 203.0.113.10
VPS_USER = clara-deploy
VPS_PORT = 22
VPS_APP_DIR = /opt/clara-ai-platform

Never commit the private key or .env.

## 4. Create the VPS deployment user
Run on the VPS as root/admin:

    sudo adduser --disabled-password --gecos "" clara-deploy
    sudo usermod -aG docker clara-deploy
    sudo mkdir -p /opt/clara-ai-platform
    sudo chown -R clara-deploy:clara-deploy /opt/clara-ai-platform

Verify:

    su - clara-deploy
    docker ps
    docker compose version

## 5. Create an SSH key
Run on your administration machine:

    ssh-keygen -t ed25519 -C "github-actions-clara" -f clara-github-actions

Install the public key on the VPS:

    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    cat clara-github-actions.pub >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys

Test:

    ssh -i clara-github-actions clara-deploy@VPS_HOST

Put the contents of clara-github-actions into the GitHub VPS_SSH_KEY secret.
Do not upload or commit this private key.

## 6. Get VPS_KNOWN_HOSTS
From the administration machine:

    ssh-keyscan -H VPS_HOST

Copy the complete output into the GitHub VPS_KNOWN_HOSTS secret.
Do not use StrictHostKeyChecking=no.

## 7. Prepare the VPS application
Create the production environment file directly on the VPS:

    sudo -u clara-deploy nano /opt/clara-ai-platform/.env

Confirm the compose project can start:

    cd /opt/clara-ai-platform
    docker compose config
    docker compose up -d --build

Check:

    docker compose ps
    curl -fsS http://127.0.0.1:4000/api/health

The health endpoint must return HTTP 200.

## 8. Enable automatic deployment
The workflow already contains the deploy-vps job.
It runs only when:
- event is push
- branch is main or Vite-Converted
- required build job succeeds

Normal test:

    git checkout Vite-Converted
    git add .
    git commit -m "test: verify VPS deployment"
    git push origin Vite-Converted

Open:
Actions -> CI/CD — Build, Scan & Push -> latest run

The job order should reach:

    Build & Push Image
        |
        v
    Deploy to VPS
        |
        v
    Verify VPS health

## 9. Manual deployment
For controlled deployment, add workflow_dispatch to the workflow trigger and use:
Repository -> Actions -> CI/CD — Build, Scan & Push -> Run workflow

Select the branch and click Run workflow.

If manual-only deployment is required, remove the automatic push condition from deploy-vps and keep workflow_dispatch.

## 10. Disable VPS deployment
Preferred temporary disable:
GitHub -> Settings -> Environments -> production

For a code-level disable, change the deployment job condition in .github/workflows/ci.yml so it evaluates false.

Example:

    if: ${{ false }}

Commit the change.

## 11. Re-enable VPS deployment
Restore the deployment condition:

    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/Vite-Converted') && needs.build.result == 'success'

Confirm all six production secrets exist.

Push a small test commit and watch:
Actions -> latest workflow -> Deploy to VPS

## 12. Verify a successful deployment
GitHub:
Actions -> CI/CD — Build, Scan & Push
Deployments -> production

VPS:

    cd /opt/clara-ai-platform
    docker compose ps
    curl -fsS http://127.0.0.1:4000/api/health

If health fails:

    docker compose ps
    docker compose logs --tail=100 clara-backend

Do not immediately redeploy repeatedly. Fix the VPS/application error first.

## 13. Rollback
Deploy a known-good repository commit using the normal CI/CD path.

Do not delete Docker volumes during rollback.

Never run:

    docker compose down -v

unless persistent data deletion is intentionally required.

## 14. Security checklist
- Use a dedicated deployment user.
- Use an Ed25519 SSH key.
- Store private SSH material only in GitHub Secrets.
- Pin/verify the VPS host key with VPS_KNOWN_HOSTS.
- Keep production .env on the VPS.
- Do not sync .env from GitHub.
- Do not expose PostgreSQL/Qdrant/Redis/RabbitMQ publicly unless required.
- Allow only required public ports.
- Keep Docker and the OS updated.
- Use GitHub Environment protection for production when manual approval is required.

## 15. Quick troubleshooting
### SSH authentication failed
Check:

    ssh -i clara-github-actions -p 22 clara-deploy@VPS_HOST

Then verify:
- VPS_HOST
- VPS_USER
- VPS_PORT
- VPS_SSH_KEY
- VPS_KNOWN_HOSTS

### Docker permission denied
Run:

    sudo usermod -aG docker clara-deploy

Then start a new SSH session and test:

    docker ps

### Compose failed
Run:

    cd /opt/clara-ai-platform
    docker compose config
    docker compose ps
    docker compose logs --tail=200

### Health check failed
Run:

    curl -i http://127.0.0.1:4000/api/health
    docker compose ps
    docker compose logs --tail=200 clara-backend

## 16. Production recommendation
During initial VPS setup:
1. Keep Vite-Converted deployment enabled.
2. Verify one complete deployment.
3. Verify /api/health.
4. Verify application traffic.
5. Configure production required approval if desired.
6. Move production deployment to main.
7. Restrict the production environment to main.