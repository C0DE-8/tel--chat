const { app, startServices } = require("./src/app");

const port = Number(process.env.PORT || 3000);

startServices()
  .then(() => {
    app.listen(port, () => {
      console.log(`Chat backend listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start chat backend:", error);
    console.error("Check backend/.env: DBMS_URL must point to a running DBMS Gateway, and API_KEY must be the full key for SITE_ID.");
    process.exit(1);
  });
