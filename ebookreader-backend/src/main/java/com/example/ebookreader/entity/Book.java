package com.example.ebookreader.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Book {

    @Id
    private String id;

    @Column(unique = true)
    private String fileHash;

    private String title, author, language, filePath, coverPath;

    private int lastReadChapterIndex = 0, totalChapters = 1;

    private double lastReadProgress = 0.0;

    public String getFileHash() {
        return fileHash;
    }

    public void setFileHash(String fileHash) {
        this.fileHash = fileHash;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

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

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getCoverPath() {
        return coverPath;
    }

    public void setCoverPath(String coverPath) {
        this.coverPath = coverPath;
    }

    public int getLastReadChapterIndex() {
        return lastReadChapterIndex;
    }

    public void setLastReadChapterIndex(int lastReadChapterIndex) {
        this.lastReadChapterIndex = lastReadChapterIndex;
    }

    public double getLastReadProgress() {
        return lastReadProgress;
    }

    public void setLastReadProgress(double lastReadProgress) {
        this.lastReadProgress = lastReadProgress;
    }

    public int getTotalChapters() {
        return totalChapters;
    }

    public void setTotalChapters(int totalChapters) {
        this.totalChapters = totalChapters;
    }
}
