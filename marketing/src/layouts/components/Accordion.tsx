
import { FaPlus } from "react-icons/fa6";
import { motion, AnimatePresence } from "motion/react";

interface AccordionProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

const Accordion = ({ question, answer, isOpen, onToggle }: AccordionProps) => {
  return (
    // Plain div, not motion.div. The scroll-reveal that used to live here resolved during SSR
    // and baked style="opacity:0;transform:translateY(20px)" onto every FAQ row in the static
    // HTML, so with JS off the questions were invisible — the section rendered as bare page
    // background. The question text is primary content and does not get to depend on
    // hydration. The two animations below are kept: both are driven by `isOpen`, which only
    // ever changes after hydration anyway, so neither can hide anything on a no-JS render.
    <div
      className="bg-card border border-border/5 py-6 px-7 rounded-3xl cursor-pointer"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      role="button"
      aria-expanded={isOpen}
      tabIndex={0}
    >
      <div className="flex justify-between gap-x-4 items-center">
        <h3 className="text-xl mb-0! font-medium">{question}</h3>

        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="size-10 rounded-full transform-none origin-center shrink-0 flex items-center text-text justify-center"
        >
          <FaPlus className="w-5 h-5" />
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4 text-gray">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Accordion;
