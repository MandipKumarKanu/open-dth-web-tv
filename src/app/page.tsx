import { StoreProvider } from "@/lib/store";
import { App } from "@/components/app-shell";

export default function Page() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
