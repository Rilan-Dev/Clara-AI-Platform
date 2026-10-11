export type OAuthSetupGuide = { url:string; label:string; note:string };
export function getOAuthSetupGuide(integrationId:string):OAuthSetupGuide|null {
 const id=integrationId.toLowerCase();
 if (["gmail","googlechat","google_docs","google_calendar","google_drive","google_contacts","google_forms","google_tasks","google_sheets"].includes(id) || id.startsWith("google_")) return {url:"https://console.cloud.google.com/apis/credentials",label:"Google Cloud Console",note:"Configure an OAuth client in the Google Cloud project where required APIs are enabled. Add the callback URI to Authorized redirect URIs and configure consent and scopes."};
 if (["microsoft_outlook","microsoft_teams"].includes(id)) return {url:"https://entra.microsoft.com/",label:"Microsoft Entra admin center",note:"In App registrations, add the callback under Authentication → Web redirect URIs and add delegated permissions for the listed scopes."};
 if (["github","github_app"].includes(id)) return {url:"https://github.com/settings/developers",label:"GitHub Developer Settings",note:"Set the OAuth App Authorization callback URL to the exact URI shown here and confirm app type and requested scopes."};
 if (id==="slack") return {url:"https://api.slack.com/apps",label:"Slack API apps",note:"Under OAuth & Permissions, add the callback under Redirect URLs and add the scopes required by the actions you plan to use."};
 if (id==="hubspot") return {url:"https://developers.hubspot.com/",label:"HubSpot Developer Platform",note:"Configure the app redirect URL and OAuth scopes, then install the app in the target HubSpot account after saving credentials."};
 if (id==="salesforce") return {url:"https://setup.salesforce.com/",label:"Salesforce Setup",note:"Configure the connected app callback URL and OAuth scopes; use the correct login domain for the target org."};
 if (id==="zoho_crm") return {url:"https://api-console.zoho.com/",label:"Zoho API Console",note:"Create a Server-based Application, register the callback URI, and choose the required CRM scopes. Ensure the data center matches the account."};
 if (id==="discord") return {url:"https://discord.com/developers/applications",label:"Discord Developer Portal",note:"Set the redirect URI in OAuth2 settings and verify requested scopes and bot permissions."};
 if (id==="dropbox") return {url:"https://www.dropbox.com/developers/apps",label:"Dropbox App Console",note:"Configure the redirect URI in OAuth 2 settings and enable only required permissions."};
 if (id==="notion") return {url:"https://www.notion.so/profile/integrations",label:"Notion integrations",note:"Configure the OAuth redirect URI and capabilities in integration settings, then authorize it in the target workspace."};
 if (id==="linear") return {url:"https://linear.app/settings/api",label:"Linear settings",note:"Register the callback URI and confirm the scopes cover the intended actions."};
 if (["jira","jira_cloud","atlassian"].includes(id)) return {url:"https://developer.atlassian.com/console/myapps/",label:"Atlassian Developer Console",note:"Configure the callback URL and required API permissions; ensure scopes match integration actions."};
 if (id==="zoom") return {url:"https://marketplace.zoom.us/develop/create",label:"Zoom App Marketplace",note:"Configure the redirect URL and minimum scopes required by the integration."};
 if (id==="mailchimp") return {url:"https://us1.admin.mailchimp.com/account/oauth2/",label:"Mailchimp OAuth settings",note:"Register Clara's exact callback URL and verify access to the audiences and campaign operations you need."};
 if (id==="intercom") return {url:"https://developers.intercom.com/",label:"Intercom Developer Hub",note:"Configure the OAuth redirect URL and permissions in app settings; confirm the target workspace."};
 if (id==="pipedrive") return {url:"https://developers.pipedrive.com/",label:"Pipedrive Developer Hub",note:"Register the callback URL and configure app scopes in developer settings."};
 if (id==="constant_contact") return {url:"https://developer.constantcontact.com/",label:"Constant Contact Developer Portal",note:"Configure the callback URL and required API scopes for the OAuth application."};
 return null;
}
