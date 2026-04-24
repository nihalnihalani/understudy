import { motion } from "framer-motion";

export const BackgroundGlows = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -left-[10%] -top-[10%] h-[500px] w-[500px] rounded-full bg-brand-indigo/10 blur-[120px]"
      />
      <motion.div
        animate={{
          x: [0, -80, 0],
          y: [0, 100, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -right-[5%] top-[10%] h-[400px] w-[400px] rounded-full bg-brand-purple/10 blur-[100px]"
      />
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -100, 0],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute bottom-[10%] left-[20%] h-[450px] w-[450px] rounded-full bg-brand-pink/5 blur-[110px]"
      />
    </div>
  );
};
