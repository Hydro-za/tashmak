import Link from 'next/link';
import { requirePerm } from '@/lib/session';
import { Top, JobStatus, PrioBadge, DueFlag, Empty } from '@/components/ui';
import { isCompletedJob, fmtDate } from '@/lib/labels';
import { sortJobs, staffNames } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
type SearchParams = { q?: string; status?: string; archived?: string };
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
 const term=(searchParams.q||'').trim().toLowerCase();const status=searchParams.status==='completed'?'completed':'active';
 const activeCount=all.filter((j:any)=>!isCompletedJob(j)).length;const completedCount=all.length-activeCount;
 const rows=all.filter((j:any)=>(archived||((status==='completed')===isCompletedJob(j)))&&(!term||[j.number,j.title,j.customer_name,...(itemMap[j.id]||[]).map((i:any)=>i.product_name)].join(' ').toLowerCase().includes(term)))
 .sort(status==='completed'?(a:any,b:any)=>String(b.completed_at||b.updated_at).localeCompare(String(a.completed_at||a.updated_at)):sortJobs);
 const getName=(j:any)=>j.title||(itemMap[j.id]||[]).map((i:any)=>i.product_name).slice(0,2).join(', ')||j.number;
 return <div className="page-jobs"><Top title="Jobs">{me.can('jobs.manage')&&<Link href="/jobs/new" className="btn primary">+ New job</Link>}</Top>
 <div className="job-switch tabs"><Link className={status==='active'&&!archived?'on':''} href="/jobs">Active ({activeCount})</Link><Link className={status==='completed'&&!archived?'on':''} href="/jobs?status=completed">Completed ({completedCount})</Link><Link className={archived?'on':''} href={archived?'/jobs':'/jobs?archived=1'}>Archived</Link></div>
 <form className="card jobs-search" action="/jobs">{status==='completed'&&<input type="hidden" name="status" value="completed"/>}{archived&&<input type="hidden" name="archived" value="1"/>}<input name="q" defaultValue={searchParams.q||''} placeholder="Search job number, name, customer or product" aria-label="Search jobs"/><button className="btn">Search</button></form>
 {!rows.length?<Empty text={archived?'No archived jobs found.':status==='completed'?'No completed jobs yet.':'No active jobs found.'} action={!archived&&me.can('jobs.manage')?<Link className="btn primary" href="/jobs/new">Create a job</Link>:undefined}/>:<div className="card jobs-table"><div className="tblwrap"><table className="tbl"><thead><tr><th>Job</th><th>Customer</th><th>Assigned to</th><th>Status</th><th>Created</th><th>{status==='completed'?'Completed':'Due'}</th></tr></thead><tbody>{rows.map((j:any)=>{const team=(assignMap[j.id]||[]).filter((a:any)=>a.active).map((a:any)=>names[a.user_id]).filter(Boolean);return <tr key={j.id}><td><Link href={'/jobs/'+j.id}><b>{getName(j)}</b></Link><div className="muted">{j.number} <PrioBadge p={j.priority}/></div></td><td>{j.customer_name||'—'}</td><td>{team.length?team.join(', '):<span className="muted">Not assigned</span>}</td><td><JobStatus job={j}/></td><td>{fmtDate(j.created_at)}</td><td>{status==='completed'?fmtDate(j.completed_at||j.updated_at):<>{fmtDate(j.due_date)}<div><DueFlag due={j.due_date} status={j.status}/></div></>}</td></tr>})}</tbody></table></div></div>}
 </div>;
}
