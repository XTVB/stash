import { useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";

export function useScrollToTopOnMount() {
  const history = useHistory();
  // Capture during render — history.action is already set before re-render
  const wasPop = useRef(history.action === "POP");

  useEffect(() => {
    if (!wasPop.current) {
      window.scrollTo(0, 0);
    }
  }, []);
}
