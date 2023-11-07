export const codeCopyScript = `
<script id="code-copy-script" type="module">
    document.querySelectorAll("pre").forEach((pre) => {
        const firstElement = pre.firstElementChild;
        if (!firstElement || firstElement.tagName !== "CODE") return;

        const copyButton = document.createElement("button");

        const innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-base"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="copy-success"><polyline points="20 6 9 17 4 12"/></svg>';

        copyButton.innerHTML = innerHTML;
        copyButton.className = "copy-button";

        pre.appendChild(copyButton);
        copyButton.addEventListener("click", () => {
            navigator.clipboard.writeText(pre.firstChild.textContent)
                .then(
                    () => {
                        copyButton.classList.add("success");
                        setTimeout(() => {
                            copyButton.classList.remove("success");
                        }, 1000);
                    }
                );

        });
    });
</script>
`;
