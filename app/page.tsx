import { parseRates } from './lib/parseRates';
import Dashboard from './components/Dashboard';

export default function Home() {
  const records = parseRates();
  return <Dashboard records={records} />;
}
