import 'server-only';

const FROM = 'Tashmak System <no.reply@flowlinestudio.co.za>';
const TEMPLATES = {
  jobAssigned: 'afadb292-4d2f-46bc-98e8-6c4a2becc023',
  jobCompleted: 'c0fc00f9-808f-4a90-99ce-e8bfb6fcf25a',
  passwordReset: '2eae510b-c0ac-4046-b75a-1dc6124e601f',
} as const;

async function sendTemplate(to: string, templateId: string, variables: Record<string, string>) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], template: { id: templateId, variables } }),
  });
  if (!response.ok) throw new Error('Resend template email failed: ' + (await response.text()).slice(0, 300));
}

export async function sendJobAssignedEmails(recipients: {email:string;name:string;employeeId:string}[], job: {jobNumber:string;jobTitle:string;customerName:string;description:string;assignedBy:string;jobUrl:string}) {
  await Promise.all(recipients.map(x => sendTemplate(x.email, TEMPLATES.jobAssigned, {
    employee_name: x.name || 'Team member', employee_id: x.employeeId || '', job_number: job.jobNumber,
    job_title: job.jobTitle, customer_name: job.customerName, job_description: job.description,
    assigned_by: job.assignedBy, job_url: job.jobUrl,
  })));
}

export async function sendJobCompletedEmails(job: {jobNumber:string;jobTitle:string;customerName:string;employeeName:string;employeeId:string;jobUrl:string}) {
  const {createAdminClient} = await import('@/lib/supabase/admin');
  const sb = createAdminClient();
  const {data:owners} = await sb.from('profiles').select('id,full_name').eq('role','owner').eq('active',true);
  if (!owners?.length) return;
  const completedAt = new Date().toLocaleString('en-ZA', {timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'});
  await Promise.all(owners.map(async owner => {
    const {data} = await sb.auth.admin.getUserById(owner.id);
    if (!data.user?.email) return;
    await sendTemplate(data.user.email, TEMPLATES.jobCompleted, {
      owner_name: owner.full_name || 'there', job_number: job.jobNumber, job_title: job.jobTitle,
      customer_name: job.customerName, employee_name: job.employeeName, employee_id: job.employeeId,
      completed_at: completedAt, job_url: job.jobUrl,
    });
  }));
}

export async function sendPasswordResetEmail(to: string, name: string, code: string) {
  await sendTemplate(to, TEMPLATES.passwordReset, {employee_name: name || 'there', reset_code: code});
}
