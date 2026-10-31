import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, JobStatus, PrioBadge, DueFlag, Empty } from '@/components/ui';
import { isCompletedJob, fmtDate, JOB_STATUS, todaySA, overdueDays } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
type SearchParams = { q?: string; status?: string; due?: string; archived?: string };
function readiness(job: any) {
  if (['ready_invoice', 'collected', 'delivered'].includes(job.status)) return 'Ready for invoice';
  if (job.status === 'ready_delivery') return 'Ready for delivery';
  if (job.status === 'ready_collection') return 'Ready for collection';
  return null;
}
export default async function Jobs({ searchParams }: { searchParams: SearchParams }) {
 const me=await requirePerm('jobs.view_all'); const archived=searchParams.archived==='1';
 let query=me.sb.from('jobs').select('*').order('created_at',{ascending:false}).limit(600);
 query=archived?query.not('archived_at','is',null):query.is('archived_at',null);
 const {data:jobData,error}=await query; if(error) throw new Error('Could not load jobs: '+error.message);
 const all=jobData||[]; const ids=all.map((j:any)=>j.id);
 const [ir,ar,names]=await Promise.all([
  ids.length?me.sb.from('job_items').select('job_id,product_name').in('job_id',ids):Promise.resolve({data:[],error:null}),
  ids.length?me.sb.from('job_assignments').select('job_id,user_id,active').in('job_id',ids):Promise.resolve({data:[],error:null}),staffNames(me.sb)]);
 if(ir.error)throw new Error('Could not load job items: '+ir.error.message); if(ar.error)throw new Error('Could not load job assignments: '+ar.error.message);
 const itemMap:Record<string,any[]>={};for(const x of ir.data||[])(itemMap[x.job_id]||=[]).push(x);
 const assignMap:Record<string,any[]>={};for(const x of ar.data||[])(assignMap[x.job_id]||=[]).push(x);
 const term=(searchParams.q||'').trim().toLowerCase();
 const status=['active','completed','ready_handoff',...Object.keys(JOB_STATUS)].includes(searchParams.status||'')?searchParams.status||'active':'active';
 const due=['today','overdue'].includes(searchParams.due||'')?searchParams.due:null;
 const activeCount=all.filter((j:any)=>!isCompletedJob(j)&&j.status!=='cancelled').length;const completedCount=all.filter((j:any)=>isCompletedJob(j)).length;const cancelledCount=all.filter((j:any)=>j.status==='cancelled').length;
 const statusMatches=(j:any)=>status==='active'?!isCompletedJob(j)&&j.status!=='cancelled':status==='completed'?isCompletedJob(j):status==='ready_handoff'?['ready_collection','ready_delivery'].includes(j.status):j.status===status;
 const dueMatches=(j:any)=>due==='today'?!isCompletedJob(j)&&j.status!=='cancelled'&&j.due_date===todaySA():due==='overdue'?overdueDays(j.due_date,j.status)>0:true;
 const rows=all.filter((j:any)=>(archived||(statusMatches(j)&&dueMatches(j)))&&(!term||[j.number,j.title,j.customer_name,...(itemMap[j.id]||[]).map((i:any)=>i.product_name)].join(' ').toLowerCase().includes(term)))
 .sort(status==='completed'?(a:any,b:any)=>String(b.completed_at||b.updated_at).localeCompare(String(a.completed_at||a.updated_at)):sortJobs);
 const filterLabel=status==='ready_handoff'?'Ready for handoff':status==='active'?'Active jobs':status==='completed'?'Completed jobs':status==='cancelled'?'Cancelled jobs':JOB_STATUS[status]?.label||'Jobs';
 const getName=(j:any)=>j.title||(itemMap[j.id]||[]).map((i:any)=>i.product_name).slice(0,2).join(', ')||j.number;
 return <div className="page-jobs"><Top title="Jobs" sub="Jobs are created from accepted quotes." />
 <div className="job-switch tabs"><Link className={status==='active'&&!archived?'on':''} href="/jobs">Active ({activeCount})</Link><Link className={status==='completed'&&!archived?'on':''} href="/jobs?status=completed">Completed ({completedCount})</Link><Link className={status==='cancelled'&&!archived?'on':''} href="/jobs?status=cancelled">Cancelled ({cancelledCount})</Link><Link className={archived?'on':''} href={archived?'/jobs':'/jobs?archived=1'}>Archived</Link></div>
 <form className="card jobs-search" action="/jobs">{status!=='active'&&<input type="hidden" name="status" value={status}/>}{due&&<input type="hidden" name="due" value={due}/>}{archived&&<input type="hidden" name="archived" value="1"/>}<input name="q" defaultValue={searchParams.q||''} placeholder="Search job number, name, customer or product" aria-label="Search jobs"/><button className="btn">Search</button></form>
 {!archived&&(status!=='active'||due)&&<div className="rowline sub"><span>Showing {filterLabel}{due==='today'?' due today':due==='overdue'?' and overdue':''}</span><Link href="/jobs">Clear filters</Link></div>}
 {!rows.length?<Empty text={archived?'No archived jobs found.':due==='today'?'No jobs are due today.':due==='overdue'?'No overdue jobs.':status==='completed'?'No completed jobs yet.':status==='cancelled'?'No cancelled jobs.':status!=='active'?`No ${filterLabel.toLowerCase()} jobs.`:'No active jobs found.'} action={undefined}/>:<div className="card jobs-table"><div className="tblwrap"><table className="tbl"><thead><tr><th>Job</th><th>Customer</th><th>Assigned to</th><th>Status</th><th>Ready for</th><th>Created</th><th>{status==='completed'?'Completed':'Due'}</th></tr></thead><tbody>{rows.map((j:any)=>{const team=(assignMap[j.id]||[]).filter((a:any)=>a.active).map((a:any)=>names[a.user_id]).filter(Boolean);const ready=readiness(j);return <tr key={j.id}><td><Link href={'/jobs/'+j.id}><b>{getName(j)}</b></Link><div className="muted">{j.number} <PrioBadge p={j.priority}/></div></td><td>{j.customer_name||'—'}</td><td>{team.length?team.join(', '):<span className="muted">Not assigned</span>}</td><td><JobStatus job={j}/></td><td>{ready?<span className="badge b-converted">{ready}</span>:<span className="muted">—</span>}</td><td>{fmtDate(j.created_at)}</td><td>{status==='completed'?fmtDate(j.completed_at||j.updated_at):<>{fmtDate(j.due_date)}<div><DueFlag due={j.due_date} status={j.status}/></div></>}</td></tr>})}</tbody></table></div></div>}
 </div>;
}
