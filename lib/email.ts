import 'server-only';

const FROM = 'Tashmak System <no.reply@flowlinestudio.co.za>';
const esc=(v:string)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function send(to:string,subject:string,html:string){
 const key=process.env.RESEND_API_KEY;
 if(!key) throw new Error('RESEND_API_KEY is not configured');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from:FROM,to:[to],subject,html})});
 if(!response.ok){const detail=await response.text();throw new Error('Resend email failed: '+detail.slice(0,300));}
}
const shell=(title:string,body:string,cta:string,url:string)=>`<div style="margin:0;background:#f3f4f6;padding:32px 12px;font-family:Arial,sans-serif;color:#17191d"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden"><div style="background:#111318;color:#fff;padding:24px 28px"><div style="font-size:12px;letter-spacing:2px;color:#cbd0d8">TASHMAK DESIGN &amp; PRINT</div><div style="font-size:22px;font-weight:700;margin-top:12px">${esc(title)}</div></div><div style="padding:28px;line-height:1.6">${body}<p style="margin:28px 0"><a href="${esc(url)}" style="display:inline-block;background:#17191d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:600">${esc(cta)}</a></p><p style="font-size:12px;color:#777">Tashmak System · Automated email, please do not reply.</p></div></div></div>`;
export async function sendJobAssignedEmails(recipients:{email:string;name:string;employeeId:string}[],job:{jobNumber:string;jobTitle:string;customerName:string;description:string;assignedBy:string;jobUrl:string}){
 await Promise.all(recipients.map(x=>send(x.email,'New job assigned: '+job.jobNumber,shell('A new job has been assigned',`<p>Hello ${esc(x.name)},</p><p>You have been assigned a job in Tashmak System.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#777">Job</td><td><b>${esc(job.jobNumber)} · ${esc(job.jobTitle)}</b></td></tr><tr><td style="padding:8px 0;color:#777">Customer</td><td>${esc(job.customerName)}</td></tr><tr><td style="padding:8px 0;color:#777">Instructions</td><td>${esc(job.description)}</td></tr><tr><td style="padding:8px 0;color:#777">Assigned by</td><td>${esc(job.assignedBy)}</td></tr></table>`,'Open job',job.jobUrl))));
}
export async function sendJobCompletedEmails(job:{jobNumber:string;jobTitle:string;customerName:string;employeeName:string;employeeId:string;jobUrl:string}){
 const {createAdminClient}=await import('@/lib/supabase/admin');
 const sb=createAdminClient();
 const {data:owners}=await sb.from('profiles').select('id,full_name').eq('role','owner').eq('active',true);
 if(!owners?.length)return;
 const addresses=await Promise.all(owners.map(async o=>{const {data}=await sb.auth.admin.getUserById(o.id);return data.user?.email||null;}));
 await Promise.all(addresses.filter((x):x is string=>!!x).map(to=>send(to,'Job completed: '+job.jobNumber,shell('Job completed',`<p>Hello,</p><p>A job has reached its completed handoff stage.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#777">Job</td><td><b>${esc(job.jobNumber)} · ${esc(job.jobTitle)}</b></td></tr><tr><td style="padding:8px 0;color:#777">Customer</td><td>${esc(job.customerName)}</td></tr><tr><td style="padding:8px 0;color:#777">Completed by</td><td>${esc(job.employeeName)} (${esc(job.employeeId)})</td></tr></table>`,'View job',job.jobUrl))));
}
export async function sendPasswordResetEmail(to:string,name:string,url:string){
 await send(to,'Reset your Tashmak System password',shell('Reset your password',`<p>Hello ${esc(name)},</p><p>We received a request to reset your Tashmak System password. Use the secure button below to choose a new password. This link is single-use and expires according to your account security settings.</p><p>If you did not request this, you can ignore this email.</p>`,'Reset password',url));
}
