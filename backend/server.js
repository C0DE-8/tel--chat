const { app, startServices } = require("./src/app");

const port = Number(process.env.PORT || 3000);

startServices()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Chat backend listening on http://localhost:${port}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Stop the other server or change PORT in backend/.env.`);
        process.exit(1);
      }

      throw error;
    });
  })
  .catch((error) => {
    console.error("Failed to start chat backend:", error);
    console.error("Check backend/.env: DBMS_URL must point to a running DBMS Gateway, and API_KEY must be the full key for SITE_ID.");
    process.exit(1);
  });
