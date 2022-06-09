import { startComputationTaskRequester } from "./cacAutoComplete";
import {
  createComputedSerie,
  createSerie,
  createUser,
  createValues,
  updateValue,
  resetAll,
} from "./domain";
import { startComputationTaskRunner } from "./taskRunner";

export async function main() {
  startComputationTaskRequester();
  startComputationTaskRunner();

  await resetAll();
  await createUser("toto", "reportSettings1");
  await createSerie("serie1", "A brand new Serie.");
  await createComputedSerie("computedSerie1", "No comment", "${serie1}+2", "serie1");
  await createValues("serie1", [{ date: new Date("2022-01-01"), number: 0 }]);
  await createValues("serie1", [{ date: new Date("2022-01-02"), number: 1 }]);
  await updateValue("serie1", new Date("2022-01-01"), 0);
  await updateValue("serie1", new Date("2022-01-01"), 1);
}

void main();
