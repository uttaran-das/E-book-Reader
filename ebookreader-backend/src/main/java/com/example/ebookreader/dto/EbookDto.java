package com.example.ebookreader.dto;

import java.util.ArrayList;

public class EbookDto {

    public static class TocItem {
        private String title, href;

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public String getHref() {
            return href;
        }

        public void setHref(String href) {
            this.href = href;
        }
    }

    private String title, author;
    private ArrayList<String> spine; // reading order
    private ArrayList<TocItem> toc; // Table of Contents

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getAuthor() {
        return author;
    }

    public void setAuthor(String author) {
        this.author = author;
    }

    public ArrayList<String> getSpine() {
        return spine;
    }

    public void setSpine(ArrayList<String> spine) {
        this.spine = spine;
    }

    public ArrayList<TocItem> getToc() {
        return toc;
    }

    public void setToc(ArrayList<TocItem> toc) {
        this.toc = toc;
    }
}