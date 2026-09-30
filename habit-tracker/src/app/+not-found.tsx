import { Redirect } from 'expo-router';

/** Unknown paths (e.g. when embedded by a host at an arbitrary URL) land on the dashboard. */
export default function NotFound() {
  return <Redirect href="/" />;
}
