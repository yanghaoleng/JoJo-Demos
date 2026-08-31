import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

function splitIntoCharacters(text) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("zh-CN", {
      granularity: "grapheme",
    });
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

export default function TextRotate({
  texts,
  rotationInterval = 2800,
  staggerDuration = 0.025,
  className = "",
}) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const characters = useMemo(
    () => splitIntoCharacters(texts[currentTextIndex] || ""),
    [currentTextIndex, texts],
  );

  useEffect(() => {
    if (reduceMotion || texts.length < 2) return undefined;
    const intervalId = window.setInterval(() => {
      setCurrentTextIndex((index) => (index + 1) % texts.length);
    }, rotationInterval);
    return () => window.clearInterval(intervalId);
  }, [reduceMotion, rotationInterval, texts.length]);

  return (
    <span className={`text-rotate ${className}`.trim()}>
      <span className="visually-hidden">{texts[currentTextIndex]}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={currentTextIndex}
          className="text-rotate-line"
          aria-hidden="true"
        >
          {characters.map((character, index) => (
            <span className="text-rotate-character-clip" key={`${character}-${index}`}>
              <motion.span
                className="text-rotate-character"
                initial={reduceMotion ? false : { y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { y: "-120%", opacity: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0.01 }
                    : {
                        type: "spring",
                        damping: 25,
                        stiffness: 300,
                        delay: index * staggerDuration,
                      }
                }
              >
                {character}
              </motion.span>
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
