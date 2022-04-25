<template>
    <div>
        test vue file
        {{ page.url}}
        <slot></slot>
    </div>
</template>

<script>
export default{
    name: 'Test',
} 
</script>
