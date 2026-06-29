import { redirect } from 'next/navigation';

/**
 * Root route. The dashboard has no content at `/`; send visitors straight to
 * the Executive Overview.
 */
export default function RootPage(): never {
  redirect('/overview');
}
