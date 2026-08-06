require("./src/env");

const { initializeSchema } = require("./src/schema");

initializeSchema()
  .then(() => {
    console.log("Seed complete: habibi/admin and sam/user are ready.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
