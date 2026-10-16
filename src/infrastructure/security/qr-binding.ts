import {cookies} from 'next/headers';
import {createHash,randomBytes} from 'node:crypto';
import {prisma} from '@/infrastructure/database/prisma';
const cookie='marcai_qr_initiator';
export async function bindQr(token:string){
 const secret=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(secret).digest('hex');
 await prisma.$executeRaw`INSERT INTO web_qr_bindings(token,initiator_hash,expires_at) VALUES(${token},${hash},${new Date(Date.now()+300000)})`;
 (await cookies()).set(cookie,secret,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:300});
}
export async function qrInitiatorHash(){const secret=(await cookies()).get(cookie)?.value;return secret?createHash('sha256').update(secret).digest('hex'):null;}
export async function ownsQr(token:string){const hash=await qrInitiatorHash();if(!hash)return false;const [row]=await prisma.$queryRaw<Array<{token:string}>>`SELECT token FROM web_qr_bindings WHERE token=${token} AND initiator_hash=${hash} AND expires_at>now()`;return !!row;}
export async function clearQrBinding(){(await cookies()).delete(cookie);}
