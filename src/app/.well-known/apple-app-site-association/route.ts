export async function GET(){
 const team=process.env.APPLE_TEAM_ID,bundle=process.env.MOBILE_IOS_BUNDLE_ID??'app.marcai.employee';
 if(!team||!/^[A-Z0-9]{10}$/.test(team))return Response.json({error:'Associated domains not configured'},{status:503});
 const appID=team+'.'+bundle;
 return Response.json({applinks:{details:[{appIDs:[appID],components:[{'/':'/tasks/*'},{'/':'/executions/*'}]}]},webcredentials:{apps:[appID]}},{headers:{'Cache-Control':'public,max-age=3600'}});
}
