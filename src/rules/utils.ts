const caret = /(^|[^\[])\^/g;

export function edit(rule: RegExp | string, opt?: string) {
    let source = typeof rule === "string" ? rule : rule.source;
    opt = opt ?? "";
    const obj = {
        replace: (name: string | RegExp, val: string | RegExp) => {
            let valSource = typeof val === "string" ? val : val.source;
            valSource = valSource.replace(caret, "$1");
            source = source.replace(name, valSource);
            return obj;
        },
        getRegex: () => {
            return new RegExp(source, opt);
        },
    };
    return obj;
}
