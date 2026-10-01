import { PRIVACY } from '../features/legal';
import { LegalPage } from '../features/legal-page';

export default function PrivacyScreen() {
  return <LegalPage title="Privacy policy" sections={PRIVACY} />;
}
