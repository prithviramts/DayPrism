import { TERMS } from '../features/legal';
import { LegalPage } from '../features/legal-page';

export default function TermsScreen() {
  return <LegalPage title="Terms of service" sections={TERMS} />;
}
