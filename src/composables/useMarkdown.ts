import { computed, type MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'
import MarkdownIt from 'markdown-it'

// Create a markdown-it instance with default options
const md = new MarkdownIt({
  html: true, // Enable HTML tags in source
  linkify: true, // Autoconvert URL-like text to links
  typographer: true, // Enable some language-neutral replacement + quotes beautification
})

export function useMarkdown(content: MaybeRefOrGetter<string>) {
  const renderedMarkdown = computed(() => {
    const contentValue = toValue(content)
    if (!contentValue) return ''
    return md.render(contentValue)
  })

  return {
    renderedMarkdown,
  }
}
