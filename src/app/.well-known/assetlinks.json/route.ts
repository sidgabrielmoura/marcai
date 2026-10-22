export async function GET(){
 const fingerprints=(process.env.ANDROID_SHA256_FINGERPRINTS??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!fingerprints.length||fingerprints.some(v=>!/^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(v)))return Response.json({error:'App links not configured'},{status:503});
 return Response.json([{relation:['delegate_permission/common.handle_all_urls','delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:process.env.MOBILE_ANDROID_PACKAGE??'com.app.tarefai',sha256_cert_fingerprints:fingerprints}}],{headers:{'Cache-Control':'public,max-age=3600'}});
}
