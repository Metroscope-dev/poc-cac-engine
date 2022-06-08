import { createComputedSerie, createSerie, createUser, createValues, resetAll } from "./domain";

export async function main() {
  await resetAll();
  await createUser("toto", "reportSettings1");
  await createSerie("serie1", "A brand new Serie.");
  await createComputedSerie("computedSerie1", "No comment", "${serie1}+2", "serie1");
  await createValues("serie1", [{ date: new Date("2022-01-01"), number: 0 }]);
}

void main();
