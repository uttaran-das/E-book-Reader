package com.example.ebookreader.dto;

import java.util.ArrayList;

public class EbookDto {
    private String title, author;
    private ArrayList<String> spine; // reading order

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
}