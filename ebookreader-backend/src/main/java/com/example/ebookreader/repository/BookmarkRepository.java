package com.example.ebookreader.repository;

import com.example.ebookreader.entity.Bookmark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;

@Repository
public interface BookmarkRepository extends JpaRepository<Bookmark, String> {
    ArrayList<Bookmark> findByBookIdOrderByCreatedAtDesc(String bookId);
}
