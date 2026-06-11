import { createFileRoute } from '@tanstack/react-router';

import { RadioView } from '../views/Radio';

export const Route = createFileRoute('/radio')({
  component: RadioView,
});
