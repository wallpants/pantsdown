import { expect, test } from "bun:test";
import { Pantsdown } from ".";

test("pantsdown.parse(test.md)", async () => {
    const pantsdown = new Pantsdown({
        renderer: {
            detailsTagDefaultOpen: true,
            relativeImageUrlPrefix: "/__localimage__/",
        },
    });

    const markdown = await Bun.file("./test.md").text();
    const html = pantsdown.parse(markdown);

    expect(html).toMatchSnapshot();
});
