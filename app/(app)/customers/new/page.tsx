import { requireOwner } from '@/lib/session';
import CustomerForm from '@/components/CustomerForm';
import { Top } from '@/components/ui';
export default async function NewCustomer() { await requireOwner(); return <><Top title="New customer" /><CustomerForm /></>; }
