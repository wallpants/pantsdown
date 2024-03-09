export type HTMLAttrs = [name: string, value: string][];

type BaseToken = {
    type: string;
    raw: string;
    text?: string;
    sourceMap?: SourceMap;
};

export type SourceMap = [start: number, end: number] | undefined;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface Tokens extends Record<string, BaseToken> {
    Space: {
        type: "space";
        raw: string;
    };
    Code: {
        type: "code";
        raw: string;
        text: string;
        codeBlockStyle?: "indented";
        lang?: string | undefined;
        sourceMap: SourceMap;
    };
    Alert: {
        type: "alert";
        raw: string;
        text: string;
        icon: string;
        tokens: Token[];
        variant: "Note" | "Important" | "Warning" | "Tip" | "Caution";
    };
    Heading: {
        type: "heading";
        raw: string;
        text: string;
        depth: number;
        tokens: Token[];
        sourceMap: SourceMap;
    };
    Table: {
        type: "table";
        raw: string;
        align: ("center" | "left" | "right" | null)[];
        header: Tokens["TableCell"][];
        rows: Tokens["TableCell"][][];
        sourceMap: SourceMap;
    };
    TableCell: {
        type: "tablecell";
        raw: string;
        text: string;
        tokens: Token[];
    };
    Hr: {
        type: "hr";
        raw: string;
        sourceMap: SourceMap;
    };
    Blockquote: {
        type: "blockquote";
        raw: string;
        text: string;
        tokens: Token[];
    };
    List: {
        type: "list";
        raw: string;
        ordered: boolean;
        start: number | "";
        loose: boolean;
        items: Tokens["ListItem"][];
    };
    ListItem: {
        type: "list_item";
        raw: string;
        text: string;
        task: boolean;
        checked?: boolean | undefined;
        loose: boolean;
        tokens: Token[];
        sourceMap: SourceMap;
    };
    Paragraph: {
        type: "paragraph";
        raw: string;
        text: string;
        pre?: boolean | undefined;
        tokens: Token[];
        sourceMap: SourceMap;
    };
    HTML: {
        type: "html";
        raw: string;
        text: string;
        pre: boolean;
        block: boolean;
        sourceMap: SourceMap;
    };
    Text: {
        type: "text";
        raw: string;
        text: string;
        tokens?: Token[];
        sourceMap?: SourceMap;
    };
    Def: {
        type: "def";
        raw: string;
        tag: string;
        href: string;
        title: string;
        sourceMap: SourceMap;
    };
    Escape: {
        type: "escape";
        raw: string;
        text: string;
    };
    Tag: {
        type: "text" | "html";
        raw: string;
        text: string;
        inLink: boolean;
        inRawBlock: boolean;
        block: boolean;
    };
    Link: {
        type: "link";
        raw: string;
        text: string;
        href: string;
        title: string | null;
        tokens: Token[];
    };
    Image: {
        type: "image";
        raw: string;
        text: string;
        href: string;
        title: string | null;
    };
    Strong: {
        type: "strong";
        raw: string;
        text: string;
        tokens: Token[];
    };
    Em: {
        type: "em";
        raw: string;
        text: string;
        tokens: Token[];
    };
    Codespan: {
        type: "codespan";
        raw: string;
        text: string;
    };
    Br: {
        type: "br";
        raw: string;
    };
    Del: {
        type: "del";
        raw: string;
        text: string;
        tokens: Token[];
    };
    Footnote: {
        type: "footnote";
        raw: string;
        text: string;
        label: string;
        content: Token[];
        sourceMap: SourceMap;
    };
    FootnoteRef: {
        type: "footnoteRef";
        raw: string;
        label: string;
    };
    Footnotes: {
        type: "footnotes";
        raw: string;
        items: Tokens["Footnote"][];
    };
}

export type Token =
    | Tokens["Space"]
    | Tokens["Code"]
    | Tokens["Heading"]
    | Tokens["Table"]
    | Tokens["TableCell"]
    | Tokens["Hr"]
    | Tokens["Blockquote"]
    | Tokens["List"]
    | Tokens["ListItem"]
    | Tokens["Paragraph"]
    | Tokens["HTML"]
    | Tokens["Text"]
    | Tokens["Def"]
    | Tokens["Escape"]
    | Tokens["Tag"]
    | Tokens["Link"]
    | Tokens["Image"]
    | Tokens["Strong"]
    | Tokens["Em"]
    | Tokens["Codespan"]
    | Tokens["Br"]
    | Tokens["Del"]
    | Tokens["Alert"]
    | Tokens["Footnote"]
    | Tokens["FootnoteRef"]
    | Tokens["Footnotes"];

export type Links = Record<string, { href: string; title: string }>;

export type PantsdownConfig = {
    renderer: {
        /**
         * Prefix to be added to relative image sources.
         * Must start and end with "/"
         *
         * @example
         * relativeImageUrlPrefix: "/__localimage__/"
         *
         * ![image](./wallpants-512.png)
         * relative src is updated and results in:
         * <img src="/__localimage__/wallpants-512.png" />
         *
         * ![image](https://avatars.githubusercontent.com/wallpants)
         * absolute src remains unchanged:
         * <img src="https://avatars.githubusercontent.com/wallpants" />
         */
        relativeImageUrlPrefix: string;

        /**
         * Whether to render <details> html tags with attribute `open=""`
         *
         * @default
         * false
         */
        detailsTagDefaultOpen: boolean;
    };
};

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type PartialPantsdownConfig = DeepPartial<PantsdownConfig>;
