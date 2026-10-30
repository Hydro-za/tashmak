-- Owner-only invoice preparation, version history and send confirmations.
create table public.job_invoices (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.jobs(id) on delete restrict,
 quote_id uuid not null references public.quotes(id) on delete restrict,
 version integer not null check(version>0),
 invoice_number text not null check(length(trim(invoice_number)) between 1 and 80),
 status text not null check(status in ('ready_for_invoice','needs_review','invoice_sent','cancelled','superseded')),
 customer_name text not null,
 job_number text not null,
 job_description text,
 quote_number text,
 sales_amount numeric(14,2) not null check(sales_amount>=0),
 vat_treatment text not null,
 vat_amount numeric(14,2) not null check(vat_amount>=0),
 materials_cost numeric(14,2) not null check(materials_cost>=0),
 labour_cost numeric(14,2) not null check(labour_cost>=0),
 invoice_total numeric(14,2) not null check(invoice_total>=0),
 verified_total numeric(14,2) not null check(verified_total>=0),
 source_snapshot jsonb not null,
 review_reason text,
 supersedes_id uuid references public.job_invoices(id),
 prepared_at timestamptz not null default now(),
 prepared_by uuid not null references public.profiles(id),
 sent_at timestamptz,
 sent_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(job_id,version)
);
create index job_invoices_job_version on public.job_invoices(job_id,version desc);
create index job_invoices_status on public.job_invoices(status,prepared_at desc);
create unique index job_invoices_invoice_number_active on public.job_invoices(lower(trim(invoice_number))) where status in ('ready_for_invoice','invoice_sent');
create table public.job_invoice_events (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.job_invoices(id) on delete restrict,
 job_id uuid not null references public.jobs(id) on delete restrict,
 event_type text not null check(event_type in ('prepared','needs_review','corrected','marked_sent','cancelled')),
 event_detail jsonb not null default '{}'::jsonb,
 performed_by uuid not null references public.profiles(id),
 performed_at timestamptz not null default now()
);
create index job_invoice_events_invoice on public.job_invoice_events(invoice_id,performed_at desc);
alter table public.job_invoices enable row level security;
alter table public.job_invoice_events enable row level security;
drop policy if exists job_invoices_owner_read on public.job_invoices;
create policy job_invoices_owner_read on public.job_invoices for select to authenticated using(public.is_owner());
drop policy if exists job_invoice_events_owner_read on public.job_invoice_events;
create policy job_invoice_events_owner_read on public.job_invoice_events for select to authenticated using(public.is_owner());
revoke insert,update,delete on public.job_invoices from anon,authenticated;
revoke insert,update,delete on public.job_invoice_events from anon,authenticated;

create or replace function public.invoice_job_snapshot(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object(
   'job_id',j.id,'job_number',j.number,'job_title',coalesce(j.title,''),
   'customer_name',coalesce(nullif(trim(j.customer_name),''),c.name),
   'quote_id',q.id,'quote_number',q.number,
   'sales_amount',nullif(q.totals->>'revenue','')::numeric,
   'vat_treatment',case when coalesce((q.totals->>'vatEnabled')::boolean,false)
      then upper(coalesce(q.totals->>'vatMode',''))||' VAT @ '||coalesce(q.totals->>'vatRate','')||'%'
      else 'No VAT' end,
   'vat_amount',nullif(q.totals->>'vat','')::numeric,
   'materials_cost',coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,material}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0),
   'labour_cost',coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,labour}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0),
   'invoice_total',nullif(q.totals->>'total','')::numeric,
   'quote_totals',q.totals,
   'items',coalesce((select jsonb_agg(jsonb_build_object('product_name',qi.product_name,'item',qi.item) order by qi.position) from public.quote_items qi where qi.quote_id=q.id),'[]'::jsonb),
   'item_count',(select count(*) from public.quote_items qi where qi.quote_id=q.id),
   'items_valid',coalesce((select bool_and(coalesce((qi.item #>> '{calc,ok}')::boolean,false) and jsonb_typeof(qi.item #> '{calc,groups}')='object') from public.quote_items qi where qi.quote_id=q.id),false)
 ) into out
 from public.jobs j
 left join public.customers c on c.id=j.customer_id
 left join public.quotes q on q.id=j.quote_id
 where j.id=p_job_id and j.archived_at is null;
 return out;
end $$;

create or replace function public.owner_invoice_queue()
returns table(job_id uuid,job_number text,job_title text,customer_name text,invoice_number text,invoice_total numeric,prepared_at timestamptz,status text,quote_number text,sales_amount numeric,vat_treatment text,vat_amount numeric,materials_cost numeric,labour_cost numeric,current_invoice_id uuid,review_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 return query
 with base as (
  select j.id,j.number,j.title,coalesce(nullif(trim(j.customer_name),''),c.name) customer,
    q.number qnumber,nullif(q.totals->>'revenue','')::numeric sales,
    case when coalesce((q.totals->>'vatEnabled')::boolean,false) then upper(coalesce(q.totals->>'vatMode',''))||' VAT @ '||coalesce(q.totals->>'vatRate','')||'%' else 'No VAT' end vat_label,
    nullif(q.totals->>'vat','')::numeric vat,
    coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,material}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0) mats,
    coalesce((select sum(coalesce(nullif(qi.item #>> '{calc,groups,labour}','')::numeric,0)) from public.quote_items qi where qi.quote_id=q.id),0) labour,
    nullif(q.totals->>'total','')::numeric total,
    coalesce(jsonb_array_length(coalesce(q.totals->'errors','[]'::jsonb)),0) errors,
    (select count(*) from public.quote_items qi where qi.quote_id=q.id) item_count,
    coalesce((select bool_and(coalesce((qi.item #>> '{calc,ok}')::boolean,false) and jsonb_typeof(qi.item #> '{calc,groups}')='object') from public.quote_items qi where qi.quote_id=q.id),false) items_valid,
    q.id quote_id,q.updated_at
  from public.jobs j left join public.customers c on c.id=j.customer_id left join public.quotes q on q.id=j.quote_id
  where j.archived_at is null
 ), latest as (
  select distinct on (i.job_id) i.* from public.job_invoices i order by i.job_id,i.version desc
 )
 select b.id,b.number,b.title,b.customer,l.invoice_number,
   b.total,coalesce(l.prepared_at,b.updated_at),
   case when l.status is not null then l.status
     when b.quote_id is null or b.customer is null or b.number is null then 'preparation_needed'
     when b.errors>0 or b.item_count=0 or not b.items_valid or b.sales is null or b.vat is null or b.total is null then 'needs_review'
     else 'preparation_needed' end,
   b.qnumber,b.sales,b.vat_label,b.vat,b.mats,b.labour,l.id,
   case when l.review_reason is not null then l.review_reason
     when b.errors>0 then 'The saved quote contains calculation errors.'
     when b.item_count=0 or not b.items_valid then 'One or more quote items do not have a valid saved cost calculation.'
     when b.sales is null or b.vat is null or b.total is null then 'The quote is missing a required sales, VAT or total figure.'
     when b.quote_id is null or b.customer is null then 'Customer, job or linked quote details are incomplete.'
     else null end
 from base b left join latest l on l.job_id=b.id
 where b.quote_id is not null or l.id is not null
 order by coalesce(l.prepared_at,b.updated_at) desc nulls last;
end $$;

create or replace function public.save_job_invoice(p_job_id uuid,p_invoice_number text,p_verified_total numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s jsonb; v_total numeric; prev public.job_invoices%rowtype; new_id uuid; next_version int; new_status text; reason text;
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 if length(trim(coalesce(p_invoice_number,'')))=0 or length(trim(p_invoice_number))>80 then raise exception 'invoice_number_required'; end if;
 s:=public.invoice_job_snapshot(p_job_id);
 if s is null or s->>'quote_id' is null then raise exception 'invoice_source_missing'; end if;
 v_total:=nullif(s->>'invoice_total','')::numeric;
 if v_total is null then raise exception 'invoice_total_missing'; end if;
 if p_verified_total is null or p_verified_total<0 then raise exception 'verified_total_required'; end if;
 if coalesce(s->>'customer_name','')='' or coalesce(s->>'job_number','')='' then raise exception 'customer_or_job_missing'; end if;
 if coalesce((s->'quote_totals'->>'errors')::text,'[]') not in ('[]','null') or coalesce((s->>'items_valid')::boolean,false)=false or coalesce((s->>'item_count')::int,0)=0 then
   new_status:='needs_review'; reason:='Saved quote calculations need review before an invoice can be prepared.';
 elsif abs(p_verified_total-v_total)>0.01 then
   new_status:='needs_review'; reason:='Verified invoice total does not match the saved quote total.';
 else new_status:='ready_for_invoice'; reason:=null;
 end if;
 select * into prev from public.job_invoices where job_id=p_job_id order by version desc limit 1 for update;
 if found and prev.status='invoice_sent' and prev.invoice_number=trim(p_invoice_number) then raise exception 'invoice_already_sent'; end if;
 if found and prev.status='ready_for_invoice' and prev.invoice_number=trim(p_invoice_number) and prev.verified_total=p_verified_total then return prev.id; end if;
 next_version:=coalesce(prev.version,0)+1;
 if found and prev.status in ('ready_for_invoice','needs_review') then
   update public.job_invoices set status='superseded' where id=prev.id;
 end if;
 insert into public.job_invoices(job_id,quote_id,version,invoice_number,status,customer_name,job_number,job_description,quote_number,sales_amount,vat_treatment,vat_amount,materials_cost,labour_cost,invoice_total,verified_total,source_snapshot,review_reason,supersedes_id,prepared_by)
 values(p_job_id,(s->>'quote_id')::uuid,next_version,trim(p_invoice_number),new_status,s->>'customer_name',s->>'job_number',nullif(s->>'job_title',''),s->>'quote_number',(s->>'sales_amount')::numeric,s->>'vat_treatment',(s->>'vat_amount')::numeric,(s->>'materials_cost')::numeric,(s->>'labour_cost')::numeric,v_total,p_verified_total,s,reason,prev.id,(select auth.uid()))
 returning id into new_id;
 insert into public.job_invoice_events(invoice_id,job_id,event_type,event_detail,performed_by)
 values(new_id,p_job_id,case when new_status='needs_review' then 'needs_review' when prev.id is not null then 'corrected' else 'prepared' end,jsonb_build_object('version',next_version,'invoice_number',trim(p_invoice_number),'verified_total',p_verified_total,'status',new_status,'reason',reason),(select auth.uid()));
 return new_id;
end $$;

create or replace function public.mark_job_invoice_sent(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.job_invoices%rowtype;
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into inv from public.job_invoices where id=p_invoice_id for update;
 if not found then raise exception 'invoice_not_found'; end if;
 if inv.status='invoice_sent' then raise exception 'invoice_already_sent'; end if;
 if inv.status<>'ready_for_invoice' then raise exception 'invoice_not_ready'; end if;
 update public.job_invoices set status='invoice_sent',sent_at=now(),sent_by=(select auth.uid()) where id=p_invoice_id;
 insert into public.job_invoice_events(invoice_id,job_id,event_type,event_detail,performed_by)
 values(p_invoice_id,inv.job_id,'marked_sent',jsonb_build_object('invoice_number',inv.invoice_number,'confirmed_at',now()),(select auth.uid()));
end $$;

create or replace function public.cancel_job_invoice(p_invoice_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.job_invoices%rowtype;
begin
 if not public.is_owner() then raise exception 'forbidden' using errcode='42501'; end if;
 select * into inv from public.job_invoices where id=p_invoice_id for update;
 if not found then raise exception 'invoice_not_found'; end if;
 if inv.status='cancelled' then return; end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'cancellation_reason_required'; end if;
 update public.job_invoices set status='cancelled',review_reason=trim(p_reason) where id=p_invoice_id;
 insert into public.job_invoice_events(invoice_id,job_id,event_type,event_detail,performed_by)
 values(p_invoice_id,inv.job_id,'cancelled',jsonb_build_object('reason',trim(p_reason),'invoice_number',inv.invoice_number),(select auth.uid()));
end $$;

grant execute on function public.invoice_job_snapshot(uuid) to authenticated;
grant execute on function public.owner_invoice_queue() to authenticated;
grant execute on function public.save_job_invoice(uuid,text,numeric) to authenticated;
grant execute on function public.mark_job_invoice_sent(uuid) to authenticated;
grant execute on function public.cancel_job_invoice(uuid,text) to authenticated;
