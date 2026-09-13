import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { ensureMigrated } from "@/lib/db/migrate";
import { getPlatformEnvSettings, setPlatformEnvSetting } from "@/modules/phone/core/db";
import { requireAuth, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { invalidateOpenAICatalogCache } from "@/modules/assistant/api/openai-catalog-cache";
import { resetEmailTransportCache } from "@/lib/email";

const CONFIRM_SECRET = process.env.PLATFORM_CONFIRM_SECRET ?? process.env.NEXTAUTH_SECRET ?? "clara-platform-confirm-secret";
const TOKEN_TTL_MS = 5 * 60 * 1000;
const MASK = "●●●●●●●●";
const MANAGED_KEYS = new Set([
  "NEXT_PUBLIC_LANDING_EMBED_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "NEXT_PUBLIC_APP_URL",
  // AI Configuration
  "AI_PROVIDER",
  "OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_EMBEDDING_MODEL", "OPENAI_REALTIME_MODEL", "OPENAI_TRANSCRIPTION_MODEL", "OPENAI_DEFAULT_VOICE",
  "GEMINI_API_KEY", "GEMINI_CHAT_MODEL", "GEMINI_EMBEDDING_MODEL", "GEMINI_REALTIME_MODEL", "GEMINI_TRANSCRIPTION_MODEL", "GEMINI_DEFAULT_VOICE",
  "AI_MAX_CHAT_TOKENS", "AI_MAX_REALTIME_TOKENS", "AI_MAX_TEMPERATURE",
  // Phone Configuration
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
  "VONAGE_API_KEY", "VONAGE_API_SECRET", "VONAGE_PHONE_NUMBER",
  "PHONE_PROVIDER",
  // Email Delivery (Resend / SMTP switcher — Settings → Email Delivery)
  "EMAIL_PROVIDER", "EMAIL_FROM_NAME", "EMAIL_FROM_ADDRESS",
  "RESEND_API_KEY",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_ADDRESS",
]);
function buildToken(key:string,value:string,ts:number):string{return crypto.createHmac("sha256",CONFIRM_SECRET).update(`${key}:${value}:${ts}`).digest("hex");}

export async function GET(req:NextRequest):Promise<NextResponse>{
  try{
    await ensureMigrated(); const auth=await requireAuth(req); await requireSuperAdmin(auth);
    const {searchParams}=new URL(req.url);
    if(searchParams.get("token")==="1"){
      const key=searchParams.get("key")??"", value=searchParams.get("value")??"";
      if(!MANAGED_KEYS.has(key)) return NextResponse.json({error:"Setting is not managed by the platform settings page."},{status:403});
      const ts=Date.now(); return NextResponse.json({confirmation_token:buildToken(key,value,ts),timestamp:ts,expires_in_ms:TOKEN_TTL_MS});
    }
    const settings=await getPlatformEnvSettings();
    const safe=settings.filter(s=>MANAGED_KEYS.has(s.key)).map(s=>{
      const effective=s.value || process.env[s.key] || "";
      return {key:s.key,value:s.isSecret?(effective?MASK:""):effective,isSet:Boolean(effective),description:s.description,category:s.category,isSecret:s.isSecret,requiresRestart:false,updatedAt:s.updatedAt};
    });
    return NextResponse.json({settings:safe});
  }catch(err){if(err instanceof NextResponse)return err;return NextResponse.json({error:(err as Error).message},{status:500});}
}

export async function POST(req:NextRequest):Promise<NextResponse>{
  try{
    await ensureMigrated(); const auth=await requireAuth(req); await requireSuperAdmin(auth);
    const body=await req.json() as {key?:string;value?:string;confirmation_token?:string;timestamp?:number};
    if(!body.key||body.value===undefined)return NextResponse.json({error:"key and value are required"},{status:400});
    if(!MANAGED_KEYS.has(body.key))return NextResponse.json({error:"Setting is not managed by the platform settings page."},{status:403});
    const current=(await getPlatformEnvSettings()).find(s=>s.key===body.key);
    if(current?.isSecret&&body.value===MASK)return NextResponse.json({ok:true,key:body.key,updatedAt:new Date().toISOString()});
    const ts=Number(body.timestamp??0); if(!body.confirmation_token||!ts)return NextResponse.json({error:"confirmation_token and timestamp are required."},{status:400});
    if(Math.abs(Date.now()-ts)>TOKEN_TTL_MS)return NextResponse.json({error:"Confirmation token expired."},{status:400});
    const expected=buildToken(body.key,body.value,ts); const provided=body.confirmation_token.padEnd(64,"0").slice(0,64); let valid=false;
    try{valid=crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(provided,"hex"));}catch{valid=false;}
    if(!valid)return NextResponse.json({error:"Invalid confirmation token."},{status:403});
    await setPlatformEnvSetting(body.key,body.value,auth.user.id);
    // Voice / AI catalog provenance: rotating an OpenAI key or model changes
    // what the Voice tab should show, so reset its Redis cache (best-effort).
    if(body.key.startsWith("OPENAI_")){
      try{ await invalidateOpenAICatalogCache(); }catch{/* cache reset is best-effort */}
    }
    // Email provider switches must not reuse the old SMTP transporter —
    // drop the pooled transport so the next send picks up new credentials.
    if(body.key.startsWith("SMTP_")||body.key.startsWith("EMAIL_")||body.key==="RESEND_API_KEY"){
      resetEmailTransportCache();
    }
    return NextResponse.json({ok:true,key:body.key,updatedAt:new Date().toISOString()});
  }catch(err){if(err instanceof NextResponse)return err;return NextResponse.json({error:(err as Error).message},{status:500});}
}
