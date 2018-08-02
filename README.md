# MCardJS

## Demo site
https://dagavi.gitlab.io/mcardjs

## Welcome!

This is a small project to learn and test my JavaScript skills with something real. This is why I created this JavaScript code that can read and modify memory cards from some videogame console systems, that you will typically have from emulators saves.

At this moment this project have support for two systems (and don't expect more):

 - Sony PlayStation: js/psxmc.js
 - Sega Dreamcast: js/vmu.js

This libraries work over raw memory card dumps. Normally emulators use this type of save, but if you  have a memory card dump with extra headers it won't work.

I provided a very simple (and ugly) HTML interface that let me learn and try some HTML+JavaScript features, like Drag&Drop (you can **drop elements from one memory card to other** or **drop your memory card files from your computer**!), canvas manipulation (for **saved games icons and animations**) and Service Workers for **offline access**.

It is missing all CSS, so is very ugly (at least at the moment!).

An up-to-date version of this (test) web is available on GitLab Pages: https://dagavi.gitlab.io/mcardjs

Links to references are provided in the source code.

Don't expect clean JavaScript/HTML code because is almost my first time writing JavaScript.

Don't expect a beuatiful UI too. I'm focused in memory card parsing and (raw/simple) visualization.

