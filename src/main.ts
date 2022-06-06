import { createComputedSerie, createSerie, createUser, resetAll } from "./domain";

export async function main() {
  await resetAll();
  await createUser("toto", "reportSettings1");
  await createSerie("serie1", "A brand new Serie.");
  await createComputedSerie("computedSerie1", "No comment", "serie1+2");
}

void main();
