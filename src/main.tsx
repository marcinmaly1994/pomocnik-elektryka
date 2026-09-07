import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import "./index.css";

/**
 * Druga, zewnętrzna granica błędu — na wypadek awarii w samej powłoce aplikacji
 * (nagłówek, pasek etapów, okna dialogowe), czyli poza granicą otaczającą treść
 * zakładki w `App`. Tamta jest tą pierwszą i lepszą: zostawia nawigację na miejscu.
 * Ta łapie to, czego tamta z definicji nie może — i zamienia biały ekran na
 * komunikat, z którego da się wyjść.
 *
 * Bez `onReset`: skoro padła powłoka, nie ma dokąd „wrócić" — zostaje odświeżenie.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
