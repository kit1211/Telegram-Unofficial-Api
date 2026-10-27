import { buildApp } from "./server/app";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp().listen(port);

console.log(
  `telegram-reverse at http://${app.server?.hostname}:${app.server?.port}`,
);
