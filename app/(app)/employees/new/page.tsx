import { requireOwner } from '@/lib/session';
import { CreateEmployeeForm } from '@/components/EmployeeForms';
import { Top } from '@/components/ui';
export default async function NewEmployee() { await requireOwner(); return <><Top title="New employee" sub="You choose the username and a temporary password" /><CreateEmployeeForm /></>; }
