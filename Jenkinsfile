pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
    }

    triggers {
        githubPush()
    }

    environment {
        REMOTE_HOST = 'root@180.188.231.138'
        REMOTE_PORT = '2253'

        // Remote backend app folder
        PROJECT_DIR = '/docker/Clara-AI-Platform/clara-backend'

        // Remote docker-compose.yml folder
        DOCKER_PROJECT_DIR = '/docker/Clara-AI-Platform'

        // Local Jenkins source folder
        // Use "." because Jenkins could not find "clara-backend/"
        LOCAL_PROJECT_DIR = '.'

        GIT_REPO = 'https://github.com/Rilan-Dev/Clara-AI-Platform.git'
        GIT_CREDENTIAL = 'Git-Cred-Rilan-Dev'
        SSH_CREDENTIAL_ID = 'vps-deploy-key'
        CLONE_BRANCH_NAME = 'Vite-Converted'
    }

    stages {
        stage('Checkout from Git') {
            steps {
                echo 'Checking out code on Jenkins...'

                git branch: "${CLONE_BRANCH_NAME}",
                    credentialsId: "${GIT_CREDENTIAL}",
                    url: "${GIT_REPO}"

                echo "Checked out branch: ${CLONE_BRANCH_NAME}"

                sh '''
                    echo "Current workspace:"
                    pwd

                    echo "Workspace files:"
                    ls -la
                '''
            }
        }

        stage('Sync Code to VPS') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                        sh '''
                            set -e

                            echo "Checking Jenkins workspace..."
                            pwd
                            ls -la

                            echo "Ensuring remote backend directory exists..."
                            ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" \
                                "mkdir -p '$PROJECT_DIR'"

                            echo "Syncing backend code to VPS..."
                            rsync -az --delete --info=progress2 --human-readable \
                                -e "ssh -p $REMOTE_PORT -o StrictHostKeyChecking=no" \
                                --exclude=".git" \
                                --exclude="node_modules" \
                                --exclude=".env" \
                                --exclude="dist" \
                                --exclude="build" \
                                --exclude=".next" \
                                --exclude=".nuxt" \
                                --exclude=".cache" \
                                --exclude="coverage" \
                                --exclude="logs" \
                                --exclude="*.log" \
                                "$LOCAL_PROJECT_DIR/" "$REMOTE_HOST:$PROJECT_DIR/"
                        '''
                    }
                }
            }
        }

        stage('Build Docker on VPS') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -e

                        ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" "
                            set -e

                            cd '$DOCKER_PROJECT_DIR'

                            echo 'Current Docker compose directory:'
                            pwd

                            echo 'Checking docker-compose.yml...'
                            ls -la

                            echo 'Building and restarting Docker containers...'
                            docker compose up -d --build clara-backend

                            echo 'Cleaning unused Docker images...'
                            docker image prune -f
                        "
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "Deployment successful!"
        }

        failure {
            echo "Deployment failed."
        }

        always {
            emailext(
                to: 'mohammedrilan.ksa@gmail.com',
                replyTo: 'mohammedrilan20022002@gmail.com',
                mimeType: 'text/html',
                debugMode: true,
                attachLog: false,
                compressLog: false,
                subject: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - ${currentBuild.currentResult}",
                body: '''
                    <!doctype html>
                    <html>
                    <head>
                      <meta charset="UTF-8">
                      <style>
                        body { margin:0; padding:0; background:#f4f7fb; font-family:Arial, Helvetica, sans-serif; color:#172033; }
                        .wrap { max-width:860px; margin:0 auto; padding:24px; }
                        .card { background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e6ebf2; box-shadow:0 8px 24px rgba(20,35,60,0.08); }
                        .header { padding:26px 30px; background:linear-gradient(135deg,#102a43,#2563eb); color:#ffffff; }
                        .brand { font-size:13px; letter-spacing:1.5px; text-transform:uppercase; opacity:.9; }
                        .title { margin:8px 0 0; font-size:24px; font-weight:700; }
                        .status { display:inline-block; margin-top:16px; padding:8px 14px; border-radius:999px; background:#ffffff; color:#102a43; font-weight:700; }
                        .content { padding:28px 30px; }
                        .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:0 0 22px; }
                        .item { background:#f8fafc; border:1px solid #e6ebf2; border-radius:12px; padding:14px; }
                        .label { color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:.7px; margin-bottom:6px; }
                        .value { font-size:15px; font-weight:700; word-break:break-word; }
                        .button { display:inline-block; background:#2563eb; color:#ffffff !important; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; margin:6px 8px 18px 0; }
                        .button.secondary { background:#0f172a; }
                        .section-title { font-size:18px; margin:22px 0 10px; color:#102a43; }
                        pre { white-space:pre-wrap; word-break:break-word; background:#0b1220; color:#d7e4ff; padding:18px; border-radius:12px; font-size:12px; line-height:1.45; max-height:620px; overflow:auto; }
                        .footer { padding:18px 30px; background:#f8fafc; color:#64748b; font-size:12px; }
                        @media (max-width:700px) { .grid { grid-template-columns:1fr; } .wrap { padding:10px; } }
                      </style>
                    </head>
                    <body>
                      <div class="wrap">
                        <div class="card">
                          <div class="header">
                            <div class="brand">RiluRaafu Corp Jenkins Notification</div>
                            <div class="title">$PROJECT_NAME - Build #$BUILD_NUMBER</div>
                            <div class="status">Status: $BUILD_STATUS</div>
                          </div>
                          <div class="content">
                            <div class="grid">
                              <div class="item"><div class="label">Project</div><div class="value">$PROJECT_NAME</div></div>
                              <div class="item"><div class="label">Build</div><div class="value">#$BUILD_NUMBER</div></div>
                              <div class="item"><div class="label">Status</div><div class="value">$BUILD_STATUS</div></div>
                              <div class="item"><div class="label">Workspace</div><div class="value">$WORKSPACE</div></div>
                            </div>

                            <a class="button" href="$BUILD_URL">Open Build</a>
                            <a class="button secondary" href="$BUILD_URL/console">View Full Console</a>

                            <h2 class="section-title">Recent Console Output</h2>
                            <pre>${BUILD_LOG, maxLines=250, escapeHtml=true}</pre>

                            <h2 class="section-title">Changes</h2>
                            <pre>${CHANGES, showPaths=true, format="%a: %m%n"}</pre>
                          </div>
                          <div class="footer">
                            Full console log is attached to this email as a compressed file. Generated by Jenkins Email Extension plugin.
                          </div>
                        </div>
                      </div>
                    </body>
                    </html>
                '''
            )

            echo 'HTML Jenkins email notification sent/requested via Email Extension plugin with console log attachment.'
        }
    }
}