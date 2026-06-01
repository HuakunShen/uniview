import { startE2EFixtures } from "../scripts/e2e-fixtures";

export default async function globalSetup() {
  return startE2EFixtures();
}
