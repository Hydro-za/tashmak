'use client';
import {useState} from 'react';import {useRouter} from 'next/navigation';import {saveRole,deleteRole} from '@/lib/actions';import {toast} from './ToastHost';
const groups:[string,string[]][]=[
 ['Jobs & workflow',['jobs.view_all','jobs.manage','jobs.work_design','jobs.work_production','qc.perform']],
 ['Customers',['customers.view','customers.manage']],
 ['Employees',['employees.view','employees.manage','roles.manage']],
 ['Accounting & operations',['salary.view','salary.manage','labour.manage']],
 ['Reports & settings',['reports.view','notifications.manage','settings.manage']]
];
const labels:Record<string,string>={'jobs.view_all':'View jobs','jobs.manage':'Manage jobs','jobs.work_design':'Design work','jobs.work_production':'Production work','customers.view':'View customers','customers.manage':'Manage customers','employees.view':'View employees','employees.manage':'Manage employees','roles.manage':'Manage roles','qc.perform':'Quality checks','salary.view':'View salary','salary.manage':'Manage salary','labour.manage':'Manage labour','settings.manage':'Manage settings','notifications.manage':'Manage notifications','reports.view':'View reports'};
const allPermissions=groups.flatMap(([,items])=>items);
export default function RoleManager({roles,permissions,rolePerms}:{roles:any[];permissions:string[];rolePerms:any[]}){
 const router=useRouter();const [selected,setSelected]=useState<any>(null);const [creating,setCreating]=useState(false);const [name,setName]=useState('');const [description,setDescription]=useState('');const [perms,setPerms]=useState<string[]>([]);const [busy,setBusy]=useState(false);
 // Use the canonical permission keys if the RPC response is wrapped differently by PostgREST.
 const available=allPermissions.filter(p=>!permissions.length||permissions.includes(p));
 function edit(r:any){setSelected(r);setCreating(!r);setName(r?.name||'');setDescription(r?.description||'');setPerms(r?rolePerms.filter(p=>p.role_id===r.id).map(p=>p.permission):[]);}
 function toggleGroup(items:string[]){const keys=items.filter(p=>available.includes(p));const all=keys.length>0&&keys.every(p=>perms.includes(p));setPerms(old=>all?old.filter(p=>!keys.includes(p)):[...new Set([...old,...keys])]);}
 async function save(){if(!name.trim()){toast('Enter a role name','bad');return;}setBusy(true);const r=await saveRole(selected?.id||null,name,description,perms);setBusy(false);if(r.ok){toast(creating?'Role created':'Role updated');setSelected(null);setCreating(false);router.refresh();}else toast(r.error||'Could not save role','bad');}
 async function remove(r:any){if(!window.confirm('Delete '+r.name+'? This is only possible when no employees are assigned to it.'))return;setBusy(true);const x=await deleteRole(r.id);setBusy(false);if(x.ok){toast('Role deleted');router.refresh();}else toast(x.error||'Could not delete role','bad');}
 return <div className="grid" style={{gap:16}}>
  <div className="card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h2 style={{marginTop:0}}>Available roles</h2><p className="muted">Choose simple access groups for each role. Owner accounts always have full access.</p></div><button className="btn primary" onClick={()=>edit(null)}>+ Create role</button></div>
   <div className="grid g2">{roles.filter(r=>!r.is_owner).map(r=><div className="metric" key={r.id}><b>{r.name}</b><div className="muted">{r.description||'Custom access role'}</div><div style={{display:'flex',gap:8,marginTop:10}}><button className="btn sm" disabled={busy} onClick={()=>edit(r)}>Edit access</button>{!r.is_system&&<button className="btn sm danger" disabled={busy} onClick={()=>remove(r)}>Delete</button>}</div></div>)}</div>
  </div>
  {(selected||creating)&&<div className="card"><h2>{creating?'Create role':'Edit role'}</h2><div className="grid g2"><div className="field"><label>Role name *</label><input value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Description</label><input value={description} maxLength={250} onChange={e=>setDescription(e.target.value)}/></div></div>
   <p className="muted">Select the areas this role can access. You can select a whole group with one checkbox.</p>
   {groups.map(([title,items])=>{const keys=items.filter(p=>available.includes(p));const checked=keys.length>0&&keys.every(p=>perms.includes(p));return <label key={title} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 10px',marginTop:8,border:'1px solid var(--line)',borderRadius:12,cursor:'pointer'}}><input type="checkbox" checked={checked} disabled={!keys.length||busy} onChange={()=>toggleGroup(items)}/><span><b>{title}</b><small className="muted" style={{display:'block'}}>{keys.map(p=>labels[p]).join(' · ')||'No permissions available'}</small></span></label>;})}
   <div style={{display:'flex',gap:8,marginTop:18}}><button className="btn primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save role'}</button><button className="btn" disabled={busy} onClick={()=>{setSelected(null);setCreating(false);}}>Cancel</button></div>
  </div>}
 </div>;
}
