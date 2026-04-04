const WRITE_EDIT_PATTERN = /Write|Edit/;

export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    "tool.execute.after": async (input) => {
      const toolName =
        input && typeof input === "object" && typeof input.tool === "string"
          ? input.tool
          : "";

      if (WRITE_EDIT_PATTERN.test(toolName)) {
        await $`.rulesync/hooks/format.sh`;
      }
    },
  };
};
