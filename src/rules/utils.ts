const caret = /(^|[^\[])\^/g;

export function edit(rule: RegExp | string, opt?: string) {
    rule = typeof rule === "string" ? rule : rule.source;
    opt = opt ?? "";
    const obj = {
        replace: (name: string | RegExp, val: string | RegExp) => {
            val = typeof val === "object" && "source" in val ? val.source : val;
            val = val.replace(caret, "$1");
            rule = (rule as string).replace(name, val);
            return obj;
        },
        getRegex: () => {
            return new RegExp(rule, opt);
        },
    };
    return obj;
}
