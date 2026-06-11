// 3-state theme (System / Light / Dark), persisted to localStorage
// ['telos-theme']; index.html applies it pre-mount, this provider keeps it
// live afterwards.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePref = "system" | "light" | "dark";

const ThemeContext = createContext<{
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}>({ pref: "system", setPref: () => {} });

function apply(pref: ThemePref) {
  const light =
    pref === "light" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const stored = localStorage.getItem("telos-theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    localStorage.setItem("telos-theme", p);
    apply(p);
  }, []);

  useEffect(() => {
    apply(pref);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (pref === "system") apply(pref);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return (
    <ThemeContext.Provider value={{ pref, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
