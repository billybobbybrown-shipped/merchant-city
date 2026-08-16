import { migrate, pool } from "./db.js";

migrate()
  .then(() => {
    console.log("[db] migrations up to date");
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
