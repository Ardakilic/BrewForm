export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    "tool.execute.after": async (input) => {
      if (new RegExp("Write|Edit").test(input.tool)) {
        await $`.rulesync/hooks/format.sh`
      }
    },
  }
}
